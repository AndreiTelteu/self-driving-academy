---
id: "255"
title: "Modele 3D pentru clădiri și mobilierul stradal rămas"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["254"]
performance_checks: ["assets","loading","frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 255 Modele 3D pentru clădiri și mobilierul stradal rămas

## Obiectiv

PBI 254 a adus pipeline-ul GLB și modelele pentru personaj, taxi, sedan, copaci, stâlpi de iluminat și bănci. Utilizatorul a cerut însă modele 3D pentru **toate** elementele vizuale. Acest task închide diferența: masele clădirilor și piesele de mobilier stradal care au rămas procedurale.

## Context și plan

- **Clădiri.** `city-scene.ts` construiește în continuare masa fiecărei clădiri din amprenta și înălțimea lotului din layout-ul 042 (1–4 etaje, 3,8–13,4 m). Un singur model de casă (`building:house-medium`, 4,4 × 4,4 m, 7,8 m) nu poate acoperi acea variație fără deformare. Sunt necesare cel puțin 3–4 tipologii (casă mică, casă medie, bloc 3–4 etaje, colț/comerț), selecționate determinist din seed-ul hărții și scalate pe amprenta reală, plus un plan de aliniere la trotuar.
- **Mobilier rămas.** Hidrant, coș de gunoi, indicator rutier, parcometru și adăpost de stație sunt încă geometrie procedurală în `city-decor.ts`. Fiecare are nevoie de un GLB CC0, de poziționare pe planul 146 și de aceleași thin instances.
- **Registry.** 254 a livrat un `GlbModelLibrary` dedicat, nu `BabylonAssetRegistry`. Dacă numărul de modele crește, unificarea (sau documentarea definitivă a celor două contracte) devine obligatorie.

Modelele candidate rămân CC0 (Innerscene, Kenney, Quaternius) și se înregistrează în `src/rendering/babylon/glb-assets.ts`, apoi în manifestul 150.

## Dependențe

- PBI 254 (catalogul, loader-ul și rig-urile GLB) trebuie să fie Done.

## Criterii de acceptare

- [ ] **Clădiri**: cel puțin trei tipologii GLB acoperă toate clădirile din layout-ul 042; înălțimea și amprenta rămân cele ale lotului (fără deformare pe verticală peste toleranța documentată), iar variația este deterministă din seed.
- [ ] **Mobilier**: hidrant, coș, indicator, parcometru și adăpost folosesc modele GLB, cu thin instances per model și fără regresie de draw calls față de 249.
- [ ] **LOD și coliziuni**: contractele 145/146 rămân neschimbate; clădirile nu primesc collider nou, iar picking-ul rămâne pe `entityId`.
- [ ] **Manifest 150**: fiecare model nou are intrare `GLB` cu octeți reali, sursă și licență; decodoarele rămân 0 B (core glTF).
- [ ] **Bugete**: `npm run perf:render-budget -- --measure` rămâne PASS, iar draw calls ale orașului nu cresc peste bugetul 203.
- [ ] **Dovezi vizuale**: capturi 239 before/after pentru `facades-close`, `city-aerial`, `street-eye-level` și `decor-lamp-shelter`.

## Verificare

- `npm run check` și `npm run assets:manifest`
- `npm run perf:render-budget -- --measure`
- Capturi 239 pentru vederile de fațadă, oraș aerian și mobilier
- Testele 145, 146, 150 și 157

## Dovezi de finalizare

De completat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

## Istoric

- 2026-11-24: Creat din diferența rămasă după 254 (clădiri și cinci piese de mobilier stradal).
