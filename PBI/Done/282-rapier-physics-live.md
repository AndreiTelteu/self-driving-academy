---
id: "282"
title: "Fizica Rapier live pentru jucător și AI"
status: "Done"
release: "V1"
module: "Fizică"
depends_on: ["260","262"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-282"
started_at: "2026-11-28T01:25:31.265Z"
completed_at: "2026-11-28T03:02:44.425Z"
---

# 282 Fizica Rapier live pentru jucător și AI

## Obiectiv

Jucătorul și AI-ul folosesc aceeași fizică Rapier și același controller, cu roți, frânare, contacte, daune și recuperare reale.

## Starea actuală și ce lipsește

- Compunerea live folosește `driveVehicle` cinematic, nu adaptorul Rapier 022/024.
- Nu există corpuri fizice, roți, suspensie sau contacte reale în joc.
- Nu există daune, avarii sau recuperare fizică în compunerea live.
- Nu există paritate player/AI pe aceeași comandă și aceeași suprafață.
- Nu există calibrare sedan/compact în jocul live.
- Nu există o probă de browser cu impact, frânare și revenire fără penetrare.

## Context și plan

- [Vehicule și fizică](../../Docs/05-vehicule-si-fizica.md)
- [Adaptorul fizic](../../Docs/physics-adapter.md)
- [Controllerul vehiculului](../../Docs/vehicle-controller.md)
- [Dinamica roților](../../Docs/wheel-dynamics.md)
- [Daunele vehiculului](../../Docs/vehicle-damage.md)
- [Recuperarea vehiculului](../../Docs/vehicle-recovery.md)
- [Calibrarea fizicii](../../Docs/physics-calibration.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 262 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] PLAYER și AUTONOMY aplică aceeași comandă prin același controller Rapier, la același tick fizic.
- [x] Roțile, suspensia, frânarea și contactele sunt reale; nu există penetrare sau teleport la contact.
- [x] Daunele și recuperarea sunt consecințe fizice, nu stări inventate de UI.
- [x] Schimbarea modului sau a vehiculului păstrează poziția, viteza și yaw-ul fără salt.
- [x] Sedanul și compactul au diferențe măsurate pe aceeași suprafață.
- [x] Costul fizicii rămâne în buget și este raportat separat de render.

## Verificare

- Probe native Rapier pentru frânare, viraj, contact și recuperare.
- Probă în browser: impact, oprire, revenire, schimbare de mod.
- Măsurare tick/frame înainte/după și cleanup.

## Dovezi de finalizare

Rezultat implementare: `src/vehicles/rapier/live.ts` (`282-live-rapier-v1`) este unicul proprietar live al lumii Rapier și refolosește 022/024/028/029/030 fără o a doua simulare sau un al doilea ledger. `walking-composition.ts` primește opțional portul physics: taxiul și civilul seed sunt corpuri dinamice reale cu roți/suspensie, orice actor 058 preluat primește un corp la poziția/viteza/yaw-ul exacte, iar restul flotei 058 rămâne pe rutele lui cu proxy-uri cinematice stabile. PLAYER și AUTONOMY trec prin același controller la 60 Hz; comenzile AUTO provin din `VehicleAutoDrive` avansat cu viteza măsurată. Clădirile sunt obstacole 028 numite, deci impactul produce contact solver și incident 029; decorul 026 rămâne resolverul static. Recuperarea R folosește `PhysicsRecoveryPort` 030, mută corpul pe o bandă sigură, zeroizează viteza și scrie un record `TELEPORT` exclus din learning. Rendererul aplică steering/spin/suspensia roților din proiecția nativă.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (489 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run physics:live -- --check` — PASS. Teste țintă 13/13. `npm test` integrat: 3.817 teste, 3.803 pass, 0 fail, 14 skip-uri istorice. Raport 15/15: PLAYER/AUTONOMY au trasee identice pe 420 tick-uri, SHA-256 `f0c21a4a…`, diff maxim 0; frânare de la 20 m/s sedan 24,556 m / compact 22,550 m; viraj 12 m/s, 0,35 steering, 180 tick-uri — yaw sedan 1,9366 rad / compact 2,5610 rad; contact 1 incident 028/029, 9.106,845 N·s, ambele mașini `DAMAGED`/`IMMOBILIZED`, gap 3,897 m, 4/4 contacte de roată; recovery `COMPLETED`, `TELEPORT`, learning-ineligible, speed 0, `AVAILABLE`, 1 record, 5/5 settere native; MANUAL→AUTO delta 0,1519 m / 0,0357 m/s / 0,00100 rad; takeover 0/0/0; cost compunere p95 4,158 ms vs baseline pereche 3,886 ms, incremental 0,272 ms, Rapier step p95 0,367 ms, sub 5,5/8 ms. Browser probe 10/10 PASS, Chrome 157/WebGL2: G enter → W → S brake → impact cu compact parcat → R recovery → M AUTO → M MANUAL; frânare 4,68 m; impact `DAMAGED/DAMAGED`, gap 7,166 m; recovery zeroizează viteza și revine `AVAILABLE`; schimbarea de mod 0,015 m cu 1→0 playeri; cost shell tick p95 6,3 ms, present p95 0,4 ms, frame p95 25,5 ms, Rapier p95 0,7 ms; capturi în `Docs/Evidence/282-live-physics/screenshots/`.

Fișiere și documente actualizate: `src/vehicles/rapier/live.ts`, `src/vehicles/rapier/index.ts`, `src/vehicles/physics.ts`, `src/vehicles/index.ts`, `src/app/walking-composition.ts`, `src/app/vehicle-auto-drive.ts`, `src/app/vehicle-recovery-road.ts`, `src/app/index.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/rendering/babylon/v3-composition-scene.ts`, `src/rendering/index.ts`, `src/main.ts`, tests vehicles/app, `scripts/run-live-physics-report.mjs`, `scripts/run-live-physics-probe.mjs`, `package.json`, `Docs/05`, `Docs/31`, `Docs/physics-adapter.md`, `Docs/Evidence/282-live-physics/`.

Limitări sau follow-up: Traficul 058 este pe proxy-uri cinematice, nu corpuri civile complet simulate; 284 deține autonomia civilă completă. Decorul rămâne pe resolverul static 026; coliziunile Rapier numite acoperă clădirile și vehiculele. Recuperarea refolosește portul/ledgerul 030 și 029, dar nu publică încă evenimentul 007 `VEHICLE_RECOVERED` și nu închide un segment 069; livrarea și închiderea segmentului rămân follow-up de integrare. Damage nu este încă alimentat în 065 fleet-health/267 dashboard. Numerele de frame Chrome/ANGLE sunt reale, dar nu sunt un gate hardware/FPS. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '282'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-282`; integrat, verificat și mutat în Done.
