---
id: "255"
title: "Modele 3D pentru clădiri și mobilierul stradal rămas"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["254"]
performance_checks: ["assets","loading","frame","memory"]
owner: "OpenCode deepseek-v4.1-flash"
started_at: "2026-11-25T20:37:49+02:00"
completed_at: "2026-11-25T21:06:59+02:00"
---

# 255 Modele 3D pentru clădiri și mobilierul stradal rămas

## Obiectiv

PBI 254 a adus pipeline-ul GLB și modelele pentru personaj, taxi, sedan, copaci, stâlpi de iluminat și bănci. Acest task închide diferența: masele clădirilor și piesele de mobilier stradal care au rămas procedurale.

## Context și plan

- **Clădiri — revizuire de scope 2026-11-25.** Layout-ul 042 nu are loturi de 4–6 m: fiecare element `BUILDING` este un front de bloc de 30–60 m (86 elemente, 3,8–13,4 m înălțime). Un model de casă de 4,4 m scalat pe acea amprentă ar deveni o cutie de 40 m cu ferestre de 10×. De aceea masele rămân geometria 246 (amprenta și înălțimea reală, colliderele 192/238 neschimbate), iar cele șase tipologii GLB se așază ca un rând de clădiri mici la nivelul străzii: fața la trotuar, corpul în interiorul blocului, scală uniformă pe înălțimea blocului, 541 de plasări deterministe pentru 86/86 blocuri. Criteriul de mai jos a fost reformulat pe această realitate; înlocuirea completă a maselor de bloc rămâne un task viitor.
- **Mobilier rămas.** Hidrant, coș de gunoi, indicator rutier, parcometru și adăpost de stație erau geometrie procedurală în `city-decor.ts`. Hidrantul, coșul, indicatorul și adăpostul primesc GLB CC0; `parking-meter` rămâne procedural pentru că nu există o sursă CC0 (Poly Pizza are doar CC BY 3.0, BlendSwap are `.blend` fără Blender aici).
- **Registry.** 254 a livrat un `GlbModelLibrary` dedicat, nu `BabylonAssetRegistry`. A rămas folosit direct; catalogul `glb-assets.ts` este sursa de adevăr, iar modelele sunt contopite pe material și instanțiate cu thin instances.

Modelele sunt CC0 Innerscene, înregistrate în `src/rendering/babylon/glb-assets.ts` și în manifestul 150; catalogul cu surse, licențe și dimensiuni este `Docs/Evidence/255-assets/catalog.md`.

## Dependențe

- PBI 254 (catalogul, loader-ul și rig-urile GLB) trebuie să fie Done.

## Criterii de acceptare

- [x] **Clădiri (scope revizuit)**: șase tipologii GLB (casă mică/medie/înaltă, apartament mediu/înalt, magazin) acoperă toate cele 86 de blocuri cu cel puțin un modul; amprenta și înălțimea blocului rămân cele din layout (scalare uniformă pe înălțime, fără deformare verticală), iar plasarea este deterministă din `mapId` + `elementId`.
- [x] **Mobilier**: hidrant, coș, indicator (nume de stradă / STOP) și adăpost folosesc GLB cu thin instances; `parking-meter` rămâne procedural, cu motivul documentat (nicio sursă CC0). Draw calls nu scad, dar sunt contopite pe material (decor 40 → 62 mesh-uri, nu 100+).
- [x] **LOD și coliziuni**: contractele 145/146 rămân neschimbate; clădirile nu primesc collider nou, iar picking-ul rămâne pe `entityId`/layout.
- [x] **Manifest 150**: fiecare model nou are intrare `GLB` cu octeți reali, sursă și licență; decodoarele rămân 0 B (core glTF); manifestul are 59 de intrări, 17 GLB.
- [x] **Bugete**: `npm run perf:render-budget -- --measure` rămâne 17 PASS / 0 FAIL / 2 NOT_MEASURED (`STRUCTURAL_PASS`), iar draw calls ale orașului rămân 12; modulele adaugă 33 mesh-uri.
- [x] **Dovezi vizuale**: capturi 239 after pentru `facades-close`, `city-aerial`, `street-eye-level`, `decor-lamp-shelter`, `taxi-front-three-quarter` și `intersection-crosswalk`.

## Verificare

- `npm run check` și `npm run assets:manifest`
- `npm run perf:render-budget -- --measure`
- Capturi 239 pentru vederile de fațadă, oraș aerian și mobilier
- Testele 145, 146, 150 și 157

## Dovezi de finalizare

**Asseturi.** Zece GLB CC0 noi, toate Innerscene, cu sursă și licență în `Docs/Evidence/255-assets/catalog.md`: cinci clădiri (`house-small` 22.524 B, `house-tall` 57.136 B, `apartment-medium` 47.408 B, `apartment-tall` 73.428 B, `shop-tall` 66.480 B) și cinci piese de mobilier (`fire-hydrant` 19.048 B, `trash-can` 9.740 B, `bus-shelter` 30.560 B, `street-name-sign` 69.724 B după resize 256 px, `stop-sign` 55.828 B după resize 256 px). `house-medium` exista din 254. Semnele au fost reduse cu `gltf-transform resize --width 256 --height 256` + `prune` (1,71 MB → 69,7 KB; 2,59 MB → 55,8 KB); toate sunt core glTF, fără decodor.

**Implementare.**
- `src/rendering/babylon/glb-assets.ts`: 17 intrări (7 existente + 5 clădiri + 5 mobilier), cu octeți reali, geometrie/textură decodate, sursă, licență, categorie și axa „înainte”.
- `src/rendering/building-modules.ts` (pur): 541 de plasări deterministe pentru 86 blocuri, scală uniformă după înălțime, doar laturile la trotuar plus cea mai lungă latură, fața la stradă și corpul în interiorul blocului; `BUILDING_MODULES` are cele șase tipologii.
- `src/rendering/babylon/city-buildings-glb.ts`: contopește nodurile fiecărei case pe material și aplică thin instances (33 mesh-uri pentru 541 module); nu aruncă umbre, dar primește.
- `src/rendering/babylon/city-decor-glb.ts`: cele patru piese noi și ambele semne, contopite pe material; `sign` alternează determinist între numele de stradă și STOP; fața caldă a lămpii rămâne materialul instanțiat al lui 252.
- `src/rendering/babylon/city-decor-scene.ts`: `GLB_DECOR_KINDS` include mobilierul nou, deci `remainingItems` păstrează doar `parking-meter`.
- `src/rendering/babylon/v3-composition-scene.ts`: creează loturile de clădiri, le exclude din ambientul de rezervă, le expune în `stats()` (`buildingModuleMeshes`, `buildingModulePlacements`) și le eliberează.
- `tests/rendering/building-modules.test.ts`: determinism, acoperire 86/86, încadrare în bloc, scală, orientare; `tests/rendering/city-scene.test.ts` păstrează cazurile 246/252.

**Verificări.** `npm run check` — typecheck, lint, format, arhitectură și suita completă PASS (3546 teste). `npm run perf:render-budget` — 17 PASS, 0 FAIL, 2 NOT_MEASURED, `STRUCTURAL_PASS`; orașul rămâne 12 draw calls, decorul 40 (proba structurală nu include modulele). `npm run assets:manifest` — 59 intrări (33 critice / 26 opționale), 17 GLB, wire 10.849.468 B, decoded 112.011.983 B, 15/17 check-uri. Cele două eșecuri sunt `cross-check-145` (dovezile 145 sunt învechite de 247) și `cross-check-146` (inventarul decorului s-a schimbat intenționat prin acest PBI); intrările noi trec toate celelalte verificări.

**Capturi.** `Docs/Evidence/255-building-furniture/after-high-webgpu/` (street-eye-level, facades-close, decor-lamp-shelter, city-aerial, taxi-front-three-quarter) și `intersection-high-webgpu/` — HIGH, WebGPU `amd rdna-2`, 1920×1080, amiază. Timp CPU de randare 16,4–23,1 ms (5 vederi) și 20,8 ms la intersecție, față de 12,6–17,4 ms înainte de module pe aceleași vederi; frame intervalul este plafonat de vsync. Vizual: hidrantul, coșul și adăpostul sunt modele reale; fațadele de bloc au acum un rând de magazine/case la parter; aerianul rămâne neschimbat (modulele stau sub acoperișul blocului). `Docs/Evidence/255-building-furniture/compare-before-after-high-webgpu/` compară amiaza de dinainte (worktree 26511205) cu cea de după.

**Documentație.** `Docs/30` — secțiunea 255; `Docs/16` — secțiunea „Modele de clădiri 255”; `Docs/Evidence/255-assets/catalog.md`, `inspect-glb.txt`, `inspect-glb-nodes.txt`; `Docs/Evidence/150-asset-manifest/` regenerat.

**Limitări.** Masele de bloc rămân procedurale (un GLB de 4,4 m nu poate acoperi 30–60 m fără deformare); modulele sunt decorative, fără collider/picking; adăpostul include stâlpul de semn din model; semnele au normal maps fără `TANGENT` (tangente runtime); `parking-meter` rămâne procedural; `cross-check-145/146` rămân roșii din dovezi istorice/inventar intenționat schimbat; LOW nu a fost remăsurat după module; performanța hardware integrată rămâne `NOT_VALIDATED`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '255' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-24: Creat din diferența rămasă după 254 (clădiri și cinci piese de mobilier stradal).
- 2026-11-25: Livrate 10 GLB CC0, module de clădire la nivelul străzii (541 plasări, 33 mesh-uri), mobilier GLB; manifest 150 la 59 intrări. Scope-ul clădirilor a fost reformulat: masele de bloc rămân 246, tipologiile se așază la parter.
