---
id: "257"
title: "Mod AUTO/MANUAL, HUD de viteză și coliziune cu mașinile AI"
status: "Done"
release: "V3"
module: "Control manual"
depends_on: ["236","256","067"]
performance_checks: ["simulation","frame"]
owner: "opencode/deepseek-v4.1-flash"
started_at: "2026-11-25T03:02:29+02:00"
completed_at: "2026-11-25T04:10:47+02:00"
---

# 257 Mod AUTO/MANUAL, HUD de viteză și coliziune cu mașinile AI

## Obiectiv

Jucarea compunerii 256 a scos la iveală trei defecte vizibile:

1. Mașina condusă trece prin mașinile AI și prin civilul static; după depășire, orbita camerei
   rămâne rotită în lateral și nu revine în spatele mașinii.
2. HUD-ul central afișează permanent `0 km/h`, deși personajul merge sau taxiul rulează.
3. Eticheta `[A] Conduce AI-ul` arată ca un buton, dar nu face nimic; `A` este tasta de viraj
   stânga, iar jucătorul nu are cum să treacă între intervenția manuală și conducerea automată.

Task-ul repară cele trei simptome fără să inventeze o a doua fizică: coliziunea folosește corpul
rotit al mașinii, modul AUTO folosește planner-ul 041/graful 033 și mecanica 023, iar HUD-ul citește
exact `CompositionFrame`.

## Context și plan

- [Doc 20 — compunerea V3](../../Docs/20-extensii-si-mers-pe-jos.md) descrie tick-ul, camera și
  adaptorul de conducere.
- [Doc 08 — interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md) și
  [Doc 07 — flotă și curse](../../Docs/07-flota-si-curse.md) descriu modurile AUTO/MANUAL/LEARNING.
- [Doc 05 — vehicule și fizică](../../Docs/05-vehicule-si-fizica.md) și PBI 238 definesc corpul
  rotit al mașinii și coliziunea cu solidele statice.
- [Doc 25 — performanță](../../Docs/25-performanta-contracte-si-benchmark.md) guvernează costul
  pe tick; se păstrează baseline-ul 256.

Plan:

- `vehicle-collision.ts` primește un test OBB–OBB pur pentru două caroserii; `driveVehicle` îl
  folosește după măturarea statică și oprește mașina înainte de suprapunere.
- Camera primește un reset hysteretic al orbitei la poziția implicită după ce obstacolul dispare;
  intrarea, ieșirea și resetul scenariului readuc imediat orbita în spate.
- `rendering-view` expune `updatePlayHud` și un buton real de mod; `main.ts` îl leagă la frame.
- `M` toggles MANUAL/AUTO; în AUTO un driver nou (`vehicle-auto-drive.ts`) urmează o rută reală
  041 peste graful 033, cu viteză limitată de banda curentă și oprire la coliziune. Butonul HUD
  face exact aceeași tranziție. LEARNING rămâne în afara scope-ului V3.

## Dependențe

- PBI 236 trebuie să fie Done.
- PBI 256 trebuie să fie Done.
- PBI 067 trebuie să fie Done (semantica M = Manual/Auto).

## Criterii de acceptare

- [x] HUD-ul central afișează viteza reală în km/h pentru personaj și pentru mașina condusă; nu mai
  rămâne la 0 când există mișcare.
- [x] `M` și butonul din HUD comută aceeași mașină între MANUAL și AUTO; în AUTO mașina urmează o
  rută READY din planner-ul 041, iar în MANUAL inputul jucătorului redevine autoritar.
- [x] Eticheta modului nu mai sugerează că `A` este butonul de mod; butonul este focusabil, are
  `aria-keyshortcuts="M"` și explică starea curentă.
- [x] Mașina condusă nu poate traversa caroseria unei mașini AI sau a civilului static; la contact
  oprește avansul, iar camera revine în spate după ce obstacolul este depășit.
- [x] `npm test`, typecheck, lint, format, architecture și proba de browser trec; costul de tick
  rămâne sub 8 ms pe fixture-ul local.

## Verificare

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`
- `npm test`
- teste noi pentru OBB, resetul orbitei, HUD și tranziția AUTO/MANUAL cu auto-drive
- `npm run composition:report -- --browser` cu o secvență care apasă `M`, conduce în AUTO, revine
  în MANUAL și verifică viteza HUD și coliziunea
- măsurare tick p50/p95 înainte/după

## Dovezi de finalizare

Rezultat implementare: `vehicleBodiesOverlap` (SAT OBB) este folosit de conducerea manuală și de
driverul AUTO pentru toate celelalte caroserii; la contact mașina rămâne pe poza anterioară și
viteza devine 0. `src/app/vehicle-auto-drive.ts` construiește o rută 041 peste graful 033, pornește
de pe banda reală cea mai apropiată și avansează cu mecanica 023 la 80% din limita benzii, alegând
o conexiune la capătul rutei. `M` și butonul HUD comută MANUAL/AUTO; în AUTO inputul 024 este ignorat,
iar în MANUAL redevine autoritar. HUD-ul central citește `CompositionFrame` la ~10 Hz și afișează
viteza în km/h și modul (`AI`/`M`); butonul are `aria-keyshortcuts="M"` și readuce focusul pe
canvas. Camera revine în spate după 30 de tick-uri fără obstrucție, iar intrarea/ieșirea/resetul
readuc imediat orbita implicită.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 warnings);
`npm run format:check` PASS; `npm run check:architecture` PASS (444 fișiere TS); `npm test`
**3539 teste, 3539 trecute, 0 eșuate**; `tests/app/vehicle-mode-hud.test.ts` **4/4 PASS** (SAT,
AUTO/MANUAL cu auto-drive real, resetul orbitei după clădire, oprirea la civilul static);
`npm run build` PASS (Vite, „built in 2.14s”); `npm run composition:report -- --check` PASS.
`npm run composition:report -- --browser` **PASS** (Chromium 156, WEBGL2/SwiftShader): pașii `AUTO`
(`M`) și `revenire MANUAL prin buton` trec, HUD-ul arată **8 km/h** în AUTO și „MANUAL · Conduci tu
(M)” după click, **24/24** mașini AI se deplasează, 0 erori de pagină/consolă. Tick p50 **5,4 ms**,
p95 **7,7 ms**, max 45,2 ms (600 eșantioane), sub bugetul provizoriu de 8 ms; față de 256
(3,70/5,50) costul suplimentar este ≈1,7/2,2 ms. Frame-ul rămâne SwiftShader, nu FPS hardware.

Fișiere și documente actualizate: `src/app/vehicle-collision.ts`, `src/app/walking-composition.ts`,
`src/app/vehicle-auto-drive.ts` (nou), `src/app/index.ts`, `src/main.ts`,
`src/rendering/babylon/v3-browser-composition.ts`, `src/ui/rendering-view.ts`,
`src/ui/character-hud.ts`, `src/style.css`, `tests/app/vehicle-mode-hud.test.ts` (nou),
`scripts/run-v3-composition-report.mjs`, `Docs/mode-auto-hud-collision.md` (nou), `Docs/08`,
`Docs/20`, `Docs/README.md`, `Docs/Evidence/257-mode-hud-collision/README.md` (nou),
`Docs/Evidence/236-browser-composition/` (browser/report/capturi regenerate),
`Docs/Evidence/216-v1-regression/` și `Docs/Evidence/163-v2-contexts/` (regenerate pentru 257 PBI),
`PBI/README.md`, `PBI/Done/238-vehicle-static-collision.md` (gate), `README.md`.

Limitări sau follow-up: LEARNING nu este activat în compunerea V3; driverul AUTO nu negociază
semafoare, prioritate, STOP sau yield și nu schimbă banda; coliziunea oprește mașina condusă, dar nu
aplică impuls mașinii AI; p95 7,7 ms este aproape de bugetul de 8 ms, deci o optimizare viitoare
poate limita verificările OBB la vecinii din indexul spațial. Proba de browser este pe SwiftShader;
playtestul uman, frame-ul hardware și soak-ul rămân `NOT_RUN` și aparțin gate-ului 224.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '257'.

## Istoric

- 2026-11-25: Creat din jucarea compunerii 256: coliziune cu AI, orbită de cameră, HUD 0 km/h și
  comutarea AUTO/MANUAL.
- 2026-11-25: Implementat și verificat. 3539/3539 teste, probă de browser cu AUTO/MANUAL și HUD
  8 km/h, oprire la caroseria civilului; mutat fizic în Done.
