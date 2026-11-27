---
id: "280"
title: "Camera first-person din poziția șoferului"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["260","263"]
performance_checks: ["frame"]
owner: "loop-pbi/deepseek-280"
started_at: "2026-11-27T22:26:57.646Z"
completed_at: "2026-11-27T23:42:32.493Z"
---

# 280 Camera first-person din poziția șoferului

## Obiectiv

`C` comută între camera din spate și first-person din poziția șoferului, fără a schimba autoritatea sau fizica.

## Starea actuală și ce lipsește

- Nu există binding `C` în compunerea live.
- Camera V3 este third-person/character; nu există ancoră în scaunul șoferului.
- Nu există tranziție între camere la intrare/ieșire sau schimbarea vehiculului.
- Nu există FOV/offset din setări aplicate camerei first-person.
- Nu există ocluzie și clipping pentru caroserie în first-person.
- Nu există probă în browser pe ambele backenduri.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Reglaje HUD și cameră](../../Docs/27-reglaje-hud-si-camera.md)
- [Camera vehiculului](../../Docs/vehicle-camera.md)
- [Input de tastatură](../../Docs/keyboard-input.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] `C` comută camera în timpul condusului și revine la camera din spate.
- [x] First-person pornește din poziția șoferului, cu FOV-ul setat și fără caroseria în față.
- [x] Intrarea, ieșirea și schimbarea vehiculului păstrează camera coerentă.
- [x] Comutarea camerei nu schimbă autoritatea, poziția, viteza sau segmentul.
- [x] Setarea este salvată și respectată după reload.
- [x] Proba vizuală arată ambele camere pe WebGPU și WebGL2.

## Verificare

- Teste pentru comutare, ancoră și păstrarea autorității.
- Probă în browser: condus, `C`, first-person, ieșire, revenire.
- Capturi înainte/după și verificarea FOV.

## Dovezi de finalizare

Rezultat implementare: `C` folosește binding-ul 009 `camera` și comută CHASE ↔ FIRST_PERSON fără să avanseze un tick sau să scrie autoritatea, poziția, viteza ori segmentul 069. FIRST_PERSON folosește controller-ul 017 existent și este publicată doar cât timp jucătorul conduce; 194 calculează CHASE în fiecare tick, deci revenirea nu are cameră stale. Ancora șoferului este calibrată din geometria 145: sedan `(-0.343, 1.460, 0.058)` m, compact `(-0.317, 1.477, -0.014)` m. FOV-ul vine din `ControlPreferences.fov` și la repaus măsoară exact setarea. Caroseria mașinii conduse este ascunsă în first-person, iar `minZ` trece de la 0,10 la 0,05 m și revine. Intrarea, ieșirea, reintrarea și schimbarea vehiculului păstrează camera; `G` formează o graniță 069 reală (entry MANUAL, exit `RETURN_TO_AUTO`, switch `VEHICLE_SWITCH`). Preferința este scrisă în 009 și în cheia unică `009-camera-mode-v1`; reload-ul restaurează FIRST_PERSON înainte de primul `C`.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (486 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run camera:first-person -- --check` — PASS. Teste țintă 12/12. `npm test` integrat: 3.797 teste, 3.783 pass, 0 fail, 14 skip-uri istorice. Raport 5/5 scenarii, digest `7a47aa66…00e4c`. Browser probe PASS pe **WebGL2 și WebGPU**, 12/12 verificări fiecare, Chrome 157 headed 1280×720: FOV setat 75°, first-person la repaus 75,0000° pe ambele backend-uri; în mers 77,2905° la 5,73 m/s (WebGL2) și 77,2595° la 5,65 m/s (WebGPU); ancoră `(9.857600, 1.460000, 2.393200)` m, `distanceM = 0`; mesh-uri vizibile 15 CHASE → 0 FIRST_PERSON → 15 după revenire; `minZ` 0,10→0,05→0,10 m; autoritate `VEHICLE:taxi-01` neschimbată, segment `271-live-three-modes:segment:1` neschimbat, viteză 0 la comutarea din repaus; exit `CHARACTER:player-character` cu CHASE, re-entry FIRST_PERSON pe `taxi-01`; reload FIRST_PERSON. Cost local: CHASE p95 0,0864 ms, FIRST_PERSON p95 0,0944 ms, delta +0,0080 ms. Capturi `webgl2-01..07` și `webgpu-01..07` în `Docs/Evidence/280-first-person-camera/screenshots/`.

Fișiere și documente actualizate: `src/settings/camera-preference.ts`, `src/settings/index.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/app/walking-composition.ts`, `src/app/index.ts`, `src/ui/character-hud.ts`, `src/main.ts`, tests app/settings, `scripts/run-first-person-camera-report.mjs`, `scripts/run-first-person-camera-probe.mjs`, `package.json`, `Docs/08`, `Docs/21`, `Docs/27`, `Docs/31`, `Docs/README.md`, `Docs/vehicle-camera.md`, `Docs/manual/06-slidere-si-camera.md`, `Docs/manual/README.md`, `README.md`, `Docs/Evidence/280-first-person-camera/`.

Limitări sau follow-up: V3 nu are interior de cabină modelat, deci întreaga caroserie exterioară a mașinii conduse este ascunsă în first-person; drumul, orașul, traficul și luminile rămân. Mouse look, recenter și pointer lock rămân contractul fixture-ului 017; PBI 280 montează `C`, ancora, FOV-ul, tranzițiile și preferința salvată. Nu există slider de offset în schema 009; offset-ul șoferului este calibrat din geometria 145, iar FOV-ul vine din setări. Proba folosește Chrome headed implicit pentru că WebGPU headless poate intra în pauza `overload`; `PLAYWRIGHT_HEADLESS=1` este opt-in și raportează backend-ul indisponibil ca `NOT_RUN`. Costul local nu este o măsurătoare hardware/FPS, iar proba nu este un playtest uman. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '280'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-280`; integrat, verificat și mutat în Done.
