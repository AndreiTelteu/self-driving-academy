---
id: "246"
title: "Clădiri cu fațade, ferestre, acoperișuri și variație"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["245"]
performance_checks: ["assets","frame","memory"]
owner: "OpenCode kimi-k3.1-pro"
started_at: "2026-11-19T02:56:44+02:00"
completed_at: "2026-11-20T18:10:00+02:00"
---

# 246 Clădiri cu fațade, ferestre, acoperișuri și variație

## Obiectiv

Clădirile sunt acum cutii maro, toate cu aceeași culoare, fără ferestre sau uși. Orașul trebuie să pară locuit: fațade cu etaje, ferestre, intrări, vitrine la parter, acoperișuri cu detalii și variație între clădiri.

## Context și plan

Geometria clădirilor provine din layoutul 042 și este extrudată cu un singur material `building` `[0.55, 0.47, 0.4]`. Blocatoarele de coliziune din 192/238 folosesc aceleași footprinturi. Footprintul, înălțimea și colliderele nu se schimbă. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 10.

## Dependențe

- PBI 245 trebuie să fie în Done (pipeline-ul de materiale și texturi PBR).

## Criterii de acceptare

- [x] Fiecare clădire are fațade cu ritm de etaje și ferestre (geometrie reală: benzi de zid cu goluri reale, pervaz/parapet/toc, sticlă retrasă), parter distinct (vitrină/intrare/servicii după clasa benzii celei mai apropiate din 042), cornișă sau parapet și acoperiș cu detalii (unități AC și ventilație pe MEDIUM și HIGH; + rezervor și casa scării pe HIGH).
- [x] Sticla ferestrelor reflectă IBL-ul (PBR `buildingGlass` cu `environmentIntensity` 2,2) și are interioare false pe HIGH (ferestre aprinse prin culori de vârf calde, deterministe din seed); pe LOW ferestrele nu se emit (masa rămâne netedă — culoare simplă, ca la cerință).
- [x] Variația este deterministă din seed-ul hărții: 8 stiluri de fațadă (cărămidă clasică/închisă/vopsită, tencuială deschisă, stuc cald, beton modern, fațadă vitrată, panou metalic) cu palete proprii, anti-repetiție pe vecinii ortogonali (distanță Manhattan ≤ 1), testate pe harta reală.
- [x] Footprintul și înălțimea rămân exact cele din 042 (masa zidului; piesele de prezentare ies cel mult 0,18 m orizontal și 2,65 m vertical, tolerat în testul 246); testele 192 (`vehicle-collision`) și 238 (`walker-collision`) trec neschimbate (23/23).
- [x] Clădirile rămân batchuite pe material (un mesh per material, slice contiguu per clădire): 12 mesh-uri / 12 draw calls pe proba 157, ca înainte de 246; vârfuri 19,6k → 386,8k (MEDIUM, proba 157), sub bugetele 223; `elementBounds`/`elementGeometry`/picking neschimbate.

## Verificare

Capturi 239 (fațade aproape, oraș de sus, stradă) înainte/după. Măsurare de frame, draw calls și memorie per preset. Testele 192 și 238.

## Dovezi de finalizare

- **Cadre înainte/după (HIGH, WebGPU, `amd rdna-2`, 1920×1080, 30 cadre):** [Evidence/246-building-facades/](../../Evidence/246-building-facades/) — `before-high-webgpu` / `after-high-webgpu` (facades-close, street-eye-level, city-aerial, fiecare cu manifest sha256). Comandă: `npm run visual:capture -- --out Evidence/246-building-facades/after-high-webgpu --preset HIGH --backend webgpu --views facades-close,street-eye-level,city-aerial` (exit 0).
- **Frame (medii CPU / interval rAF, before → after):** facades-close 10,50/16,69 ms → 12,47/31,16 ms (un pas de cadru în plus în viziunea de apropiere a fațadelor); street-eye-level 7,66/22,81 → 7,57/23,93 ms; city-aerial 7,21/16,69 → 8,11/22,25 ms.
- **Bugete 157 (re-măsurate, `npm run perf:render-budget -- --measure` + derivare):** draw calls 12→12, mesh-uri 12→12, vârfuri 19.572→386.796, triunghiuri 9.810→194.454 (proba MEDIUM, pe NullEngine); gate STRUCTURAL_PASS, 17 PASS / 0 FAIL; `Docs/Evidence/157-render-budget/` regenerat.
- **Manifest 150:** 37 → 40 intrări (27 → 30 critice; cele 3 texturi de fațadă atribuite `consumers: ['246']`), `npm run assets:manifest` acoperit de testul actualizat (14/14).
- **Teste:** `npm run check` complet (typecheck PASS, lint PASS, format PASS, arhitectură PASS, `npm test` 3524/3525 — singurul eșec este testul de timing `tests/workers/protocol.test.ts` „cancel 142 ms > 100 ms", din domeniul workers, neatins de 246; re-rulat izolat: 9/9, și a trecut în rularea completă anterioară 3525/3525 — flaky sub încărcarea mașinii după build/capturi); suitele atinse: `building-facades` 6/6, `city-scene` 6/6, `shadows` 11/11, `render-budget` 6/6, `asset-manifest` 14/14, `vehicle-collision` + `walker-collision` 23/23. `assets:manifest -- --check` PASS (evidența 150 regenerată).
- **Fișiere:** `src/rendering/building-facades.ts` (nou), `src/rendering/surface-textures.ts`, `src/rendering/babylon/surface-materials.ts`, `src/rendering/babylon/city-scene.ts`, `src/rendering/babylon/v3-composition-scene.ts`, `src/build/asset-manifest-sources.ts`, `scripts/run-render-budget-report.mjs` (comentariu), `tests/rendering/building-facades.test.ts` (nou), `tests/rendering/shadows.test.ts`, `tests/build/asset-manifest.test.ts`, `Docs/30-calitate-vizuala-v4.md`, `Docs/16-asseturi-vizual-si-audio.md`, `Docs/Evidence/157-render-budget/*`, `Docs/Evidence/150-asset-manifest/*` (regenerate).
- **Limitări.** Interioarele false sunt culori de vârf calde + geam retras (nu parallax mapping/cubemap); fără LOD/impostori dincolo de batchingul pe material (volumul de vârfuri crește, dar rămâne sub buget; gate-ul 253 măsoară global); pe LOW clădirile rămân mase plate intenționat; generarea texturilor HIGH adaugă ~0,3 s la încărcare (aceeași limită ca 245); texturile nu sunt KTX2 (neșchimbat față de 245).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '246' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-20: Finalizat: 8 stiluri de fațadă deterministe cu anti-repetiție pe vecini, ferestre reale (goluri + sticlă retrasă + tâmplărie), parter după clasa benzii, cornișă/parapet, detalii de acoperiș pe MEDIUM/HIGH, materiale PBR + 3 texturi procedurale; 12 mesh-uri/12 draw calls neschimbate, bugetele 157 re-măsurate (STRUCTURAL_PASS), manifestul 150 la 40 intrări; `npm run check` verde (vezi nota flaky din Dovezi).
- 2026-11-19: Început (owner OpenCode kimi-k3.1-pro) — plan pur `building-facades.ts` + emitere în `city-scene.ts`.
- 2026-11-16: PBI creat din auditul vizual: clădiri ca niște cutii maro uniforme, fără ferestre.
