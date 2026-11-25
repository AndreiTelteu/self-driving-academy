---
id: "256"
title: "Trafic AI vizibil în compunerea de browser"
status: "Done"
release: "V3"
module: "Flotă și curse"
depends_on: ["058","236"]
performance_checks: ["simulation","frame"]
owner: "opencode/deepseek-v4.1-flash"
started_at: "2026-11-24T23:18:11+02:00"
completed_at: "2026-11-25T00:29:18+02:00"
---

# 256 Trafic AI vizibil în compunerea de browser

## Obiectiv

Jocul principal afișează astăzi doar taxiul parcat și un singur vehicul civil static, deci orașul pare
gol. Contractul 058 există și este testat, dar nu este legat de compunerea jucabilă 236. Acest task
leagă traficul civil real de compunerea de browser: cel puțin 20 de mașini conduse de AI pornesc din
benzi autorate, primesc rute prin planner-ul 041 și se deplasează continuu pe hartă, cu pozițiile
publicate în același cadru de 60 Hz folosit de personaj, cameră, coliziuni și renderer.

## Context și plan

- [06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie stilul comun și
  interacțiunile de trafic; [civil-traffic.md](../../Docs/civil-traffic.md) documentează contractul 058.
- [20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) și
  [30-calitate-vizuala-v4.md](../../Docs/30-calitate-vizuala-v4.md) descriu compunerea V3 și scena V4.
- [25-performanta-contracte-si-benchmark.md](../../Docs/25-performanta-contracte-si-benchmark.md)
  guvernează costul pe tick și pe frame; se păstrează un baseline înainte de schimbare.
- Citește [workflow-ul PBI](../AGENTS.md) înainte de implementare.

Plan: compunerea 236 primește opțional contractul 058, avansează traficul înaintea arbitrajului de
input, publică actorii în `CompositionFrame.vehicles` cu conversia corectă a headingului
(0 = +X în graful de benzi, 0 = +Z în compunere) și îi tratează ca mașini de oraș, nu ca vehicule
preluabile de jucător. `src/main.ts` creează traficul proaspăt pentru fiecare backend, ca recuperarea
GPU să nu refolosească un `lastTick` vechi.

## Dependențe

- PBI 058 trebuie să fie Done.
- PBI 236 trebuie să fie Done.

## Criterii de acceptare

- [x] În aplicația reală apar cel puțin 20 de mașini conduse de AI, pe lângă taxiul jucătorului; toate
  au rute READY din planner-ul 041 și poziții finite în fiecare cadru.
- [x] Cel puțin 80% dintre mașinile AI se deplasează vizibil pe parcursul a 300 de tick-uri
  (deplasare cumulată peste 5 m), iar viteza și headingul publicate corespund mișcării.
- [x] Traficul evită taxiul jucătorului și celălalt vehicul static ca lideri în aceeași bandă, iar
  intrarea forțată într-o mașină AI este refuzată explicit, nu teleportează vehiculul.
- [x] Bugetul de simulare rămâne sub 8 ms/tick pe fixture-ul local, iar compunerea fără trafic
  (testele existente 236) rămâne neschimbată.
- [x] Proba de browser arată mașinile AI mișcându-se și nu introduce erori de consolă sau de pagină.

## Verificare

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`
- `npm test`
- test nou pentru compunerea cu trafic (20+ actori, mișcare, refuzul intrării, determinism)
- `npm run composition:report -- --browser` pentru proba reală în browser
- măsurare locală tick/frame înainte/după, raportată în dovezi

## Dovezi de finalizare

Rezultat implementare: `src/app/ambient-traffic.ts` creează 20 de taxiuri în registry-ul 057
(minimul contractului) plus 24 de civili, un stil comun din valorile implicite 092 și traficul 058
peste harta 032/graful 033. Primele benzi de spawn sunt alese determinist după distanța originii
față de jucător prin opțiunea nouă, backward-compatible, `spawnLanes` a lui 058; ruta rămâne
exclusiv planner-ul 041. `createV3Composition` primește opțional traficul, îl pașește înaintea
arbitrajului de input, publică cei 24 de actori în `CompositionFrame.vehicles` cu conversia
`yaw = normalize(π/2 − heading)` și refuză preluarea lor cu `ENTER_REFUSED: AI_TRAFFIC`.
Taxiul și civilul static sunt trimise ca observații externe 044, deci devin lideri semantici.
`src/main.ts` creează un trafic proaspăt pentru fiecare backend și eliberează registry-ul și
traficul la dispose; compunerea fără trafic rămâne cele două vehicule 236.

Verificări executate și rezultat: `npm run typecheck` PASS (app + tests); `npm run lint` PASS
(0 warnings); `npm run format:check` PASS; `npm run check:architecture` PASS (443 fișiere TS și
probe negative); `npm test` **3535 teste, 3535 trecute, 0 eșuate**; `npm run build` PASS
(typecheck + Vite, 1339 module); testul nou
`tests/app/ambient-traffic.test.ts` **4/4 PASS** (24 actori cu rute READY, spawn vizibil, mișcare
24/24 peste 5 m în 300 tick-uri, heading `lane:00N0` pe +Z, refuzul intrării, compunerea fără
trafic neschimbată, determinism); `tests/fleet/civil-traffic.test.ts` **12/12 PASS**, inclusiv
testul nou pentru `spawnLanes`/`spawnOffsetsM`; `npm run composition:report -- --check` PASS.
`npm run composition:report -- --browser` **PASS**, Chromium 156.0.8078.4, WEBGL2 prin
ANGLE/SwiftShader, 26 vehicule în scenă, **24/24 mașini AI deplasate peste 1 m**, 0 erori de
pagină și 0 erori de consolă, 7 capturi. Tick-ul de compunere: p50 **3,70 ms**, p95 **5,50 ms**,
max 53,7 ms (600 eșantioane), sub bugetul provizoriu de 8 ms; baseline-ul 236 fără trafic era
p50 0,50 ms / p95 1,10 ms, deci costul suplimentar este ≈3,2 ms/tick. Frame-ul p50 ≈1,27 s este
SwiftShader și nu este raportat ca FPS hardware. Pe acest backend jocul intră corect în pauză de
overload; scriptul probei reia pauza și retrimite tastele ținute, fără să schimbe simularea.

Fișiere și documente actualizate: `src/app/ambient-traffic.ts` (nou), `src/app/walking-composition.ts`,
`src/app/composition-world.ts`, `src/app/index.ts`, `src/fleet/civil-traffic.ts`,
`src/rendering/babylon/v3-browser-composition.ts`, `src/main.ts`,
`scripts/run-v3-composition-report.mjs`, `tests/app/ambient-traffic.test.ts` (nou),
`tests/fleet/civil-traffic.test.ts`, `Docs/browser-ai-traffic.md` (nou), `Docs/civil-traffic.md`,
`Docs/06-autonomie-si-trafic.md`, `Docs/20-extensii-si-mers-pe-jos.md`, `Docs/README.md`,
`Docs/Evidence/256-browser-ai-traffic/README.md` (nou), `Docs/Evidence/236-browser-composition/`
(`browser.json`, `report.md`, capturi), `Docs/Evidence/216-v1-regression/` și
`Docs/Evidence/163-v2-contexts/` (regenerate pentru graful de 256 PBI), `PBI/README.md`.

Limitări sau follow-up: 058 nu acționează semafoare, prioritate în intersecție, STOP sau yield
(contractele 036/037/038/045/050–054); mașinile AI nu sunt preluabile, iar reconcilierea poziției la
`resume` rămâne un follow-up; personajul pe jos nu este injectat ca obstacol pentru AI; contactul
fizic dintre taxiul condus și AI nu este rezolvat de compunere. Proba de browser este pe
SwiftShader, nu pe GPU real; playtestul uman, frame-ul hardware și soak-ul rămân `NOT_RUN` și
aparțin gate-ului 224.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '256'.

## Istoric

- 2026-11-24: Creat la cererea utilizatorului: orașul are prea puține mașini conduse de AI.
- 2026-11-25: Implementat și verificat. 24 de mașini AI peste contractul 058, compunere 236 și
  probă de browser cu 24/24 actori deplasați; 3535/3535 teste; mutat fizic în Done.
