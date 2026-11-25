# Dovezi 257 — mod AUTO/MANUAL, HUD de viteză și coliziune cu mașinile AI

Status: implementat și verificat pe 25 noiembrie 2026. Nivel de validare: `targeted` — teste
deterministe, cost local și probă de browser scurtă pe SwiftShader; playtestul uman și frame-ul pe
GPU real rămân `NOT_RUN`.

## Ce s-a livrat

- `src/app/vehicle-collision.ts` — `vehicleBodiesOverlap`, SAT pentru două caroserii rotite în X/Z.
- `src/app/walking-composition.ts` — verificarea caroseriilor AI/statice la conducerea manuală și
  AUTO, driverul AUTO, `vehicleMode`/`setVehicleMode`/`toggleVehicleMode`, resetul orbitei camerei.
- `src/app/vehicle-auto-drive.ts` — driver AUTO pur: rută 041 peste graful 033, viteză 80% din
  limita benzii, mecanica 023, următoarea bandă la capătul rutei.
- `src/main.ts` — butonul de mod din HUD, focusul pe canvas după click, HUD-ul de viteză din frame.
- `src/ui/rendering-view.ts` — buton real de mod, `updatePlayHud`, viteză km/h și simbol `AI`/`M`.
- `src/style.css` — butonul HUD rămâne apăsabil peste canvas (`pointer-events: auto`).
- `src/rendering/babylon/v3-browser-composition.ts` — tasta `M`, harta/graful pentru AUTO.
- `tests/app/vehicle-mode-hud.test.ts` — 4 teste noi.
- Documentație: `Docs/mode-auto-hud-collision.md`, `Docs/08`, `Docs/20`, `Docs/README`.

## Verificări executate

```text
npm run typecheck                     PASS
npm run lint                          PASS (0 warnings)
npm run format:check                  PASS
npm run check:architecture            PASS (444 fișiere TS)
npm test                              3539 teste, 3539 trecute, 0 eșuate
npm run build                         PASS (Vite, „built in 2.14s”)
npm run composition:report -- --check PASS
npm run composition:report -- --browser
                                      PASS, backend WEBGL2 (ANGLE/SwiftShader)
```

Teste țintite (`tests/app/vehicle-mode-hud.test.ts`):

```text
✔ 257: OBB SAT separates parallel and rotated bodies and detects real overlap
✔ 257: M comută MANUAL/AUTO, AUTO conduce pe rută, iar MANUAL readuce inputul
✔ 257: orbita camerei revine în spate după ce obstacolul este depășit
✔ 257: mașina condusă se oprește la caroseria civilului static, fără să treacă prin ea
4/4 PASS
```

Testele existente 236, 238 și 058 rămân verzi.

## Proba de browser

Sursa: [Evidence/236-browser-composition/browser.json](../236-browser-composition/browser.json).

- Chromium 156.0.8078.4, viewport 1440×900, **WEBGL2** prin ANGLE/SwiftShader.
- Pași noi: `AUTO` (`M`) → **8 km/h** în HUD, taxiul se deplasează fără `W`; `revenire MANUAL prin
  buton` → mod `MANUAL` și textul „MANUAL · Conduci tu (M)”.
- Toți cei **24 de actori AI** s-au deplasat peste 1 m; 0 erori de pagină/consolă.
- Capturi: `01-start.png` … `08-revenire.png` în
  [Evidence/236-browser-composition/screenshots](../236-browser-composition/screenshots).

Cost măsurat în browser (600 eșantioane de tick):

| Metrică | 256 (fără AUTO) | 257 (AUTO + coliziune + HUD) | Buget provizoriu |
| --- | ---: | ---: | ---: |
| Tick p50 | 3,70 ms | **5,40 ms** | 8 ms |
| Tick p95 | 5,50 ms | **7,70 ms** | 8 ms |
| Tick max | 53,7 ms | 45,2 ms | — |

Costul suplimentar este de ≈1,7 ms la p50 și ≈2,2 ms la p95, în principal driverul AUTO și
verificarea caroseriilor. p95 rămâne sub 8 ms, dar marja este mică; o optimizare ulterioară poate
reduce numărul de verificări OBB la vecinii din indexul spațial. Intervalele de cadru rămân ale
randării software SwiftShader, nu FPS hardware.

## Limitări

- `LEARNING` nu este activat în compunerea V3; `M` comută doar MANUAL/AUTO.
- Driverul AUTO nu negociază semafoare, prioritate, STOP sau yield și nu schimbă banda.
- Coliziunea oprește mașina condusă; nu aplică impuls mașinii AI. AI-ul este oprit semantic prin
  liderul 044.
- Proba de browser este pe SwiftShader; gate-ul 224 rămâne responsabil pentru hardware real.
