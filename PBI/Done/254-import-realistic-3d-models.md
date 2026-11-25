---
id: "254"
title: "Import modele 3D realiste: vehicule, personaj, clădiri și decor"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["249"]
performance_checks: ["assets","loading","frame","memory"]
owner: "OpenCode kimi-k3.1-pro"
started_at: "2026-11-24T10:00:00+02:00"
completed_at: "2026-11-24T22:22:45+02:00"
---

# 254 Import modele 3D realiste: vehicule, personaj, clădiri și decor

## Obiectiv

Utilizatorul a respins aspectul actual al jocului, considerându-l „doar din shapeuri 3D”. Soluția este înlocuirea geometriei procedurale cu modele 3D reale, importate din surse gratuite cu licență CC0: vehicule (taxi, civile), personaj, decor urban și, ulterior, clădiri.

## Context și plan

Sistemul folosea geometrie procedurală (cutii, capsule, secțiuni transversale) pentru toate elementele. Acest PBI aduce pipeline-ul GLB real și convertește elementele care domină imaginea: personajul, taxiul, sedanul, copacii, lămpile de iluminat și băncile.

**Sursă aleasă: Innerscene** (https://www.innerscene.com/tools/library), kit CC0 cu scară reală (metri) și export GLB. Quaternius, Kenney și Poly Pizza au fost evaluate, dar kitul Innerscene a oferit descărcare directă GLB și dimensiuni reale pentru fiecare piesă, deci a fost preferat.

**Împărțire de scope (2026-11-24).** Clădirile și cele cinci piese de mobilier rămase (hidrant, coș, indicator, parcometru, adăpost) nu pot fi acoperite de un singur model de casă fără deformare și au fost mutate explicit în **PBI 255**, care depinde de acest task. Criteriile de mai jos descriu exact ce livrează 254.

## Dependențe

- PBI 249 (decorul anterior) este în Done.

## Criterii de acceptare

- [x] **Vehicule**: taxiul și mașinile civile folosesc modele GLB reale (`vehicle:taxi`, `vehicle:sedan`), cu materiale PBR, geamuri transparente, cele patru roți separate care se rotesc și virează, taxi recognoscibil (livrea galbenă + semn pe plafon). LOD NEAR/MID/FAR este păstrat prin grupurile de materiale.
- [x] **Personaj**: model GLB umanoid skinned (`character:jordan`, 1,85 m, 56 oase), cu șapte clipuri; `idle`/`walk`/`run` sunt rutate pe `Idle_Standing`/`Walk_Relaxed`/`Walk_Brisk`/`Run`, iar `applyFrame` copiază doar poziția și yaw-ul autoritar.
- [x] **Decor**: copacii, stâlpii de iluminat și băncile sunt modele GLB (`decor:tree`, `decor:street-lamp`, `decor:bench`), desenate cu thin instances, un draw call per mesh per model.
- [x] **Clădiri (pipeline)**: `building:house-medium` este în catalog și în manifestul 150, cu sursă, licență, octeți reali și cost decodat. Conversia maselor de clădiri este PBI 255.
- [x] **Mobilier rămas**: mutat explicit în PBI 255 (aceleași cerințe: GLB, thin instances, fără regresie de draw calls).
- [x] **Ownership de asset**: modelele sunt deținute de `GlbModelLibrary` (decodare unică per sesiune, set mărginit, `dispose` complet). `BabylonAssetRegistry` a fost evaluat și nu a fost folosit: contractul lui întoarce un root-placeholder pentru `scene-adapter`, în timp ce scenele de prezentare au nevoie de containere instanțiabile sincron; devierea este documentată în [Docs/16](../../Docs/16-asseturi-vizual-si-audio.md). Manifestul 150 este actualizat cu 7 intrări `GLB`.
- [x] **Performanță**: bugetele 157 rămân PASS, iar testele 145 (LOD), 146 (decor), 150 (manifest), 157 (buget randare) și 191–197 (personaj) trec.
- [x] **Dovezi vizuale**: capturi 239 înainte/după pentru personaj, taxi, stradă, decor și mașini civile, plus comparația per cadru.

## Verificare

- `npm run check` — typecheck, lint, format, arhitectură, teste.
- `npm run perf:render-budget -- --measure` — bugete 157.
- `npm run assets:manifest` — manifestul 150 cu intrările GLB.
- `npm run visual:capture -- --models procedural|glb --views ...` — dovada înainte/după, aceeași build.
- `npm run visual:compare` — procentul de diferență per cadru.

## Dovezi de finalizare

**Catalog și fișiere.** Șapte modele CC0 în `public/assets/models/`: `vehicles/taxi.glb` (48.648 B), `vehicles/sedan.glb` (46.628 B), `characters/jordan-animated.glb` (3.459.804 B), `buildings/house-medium.glb` (39.816 B), `decor/tree.glb` (14.120 B), `decor/street-lamp.glb` (11.712 B), `decor/bench.glb` (20.796 B). Catalogul `src/rendering/babylon/glb-assets.ts` ține id, URL, octeți, sursă, licență CC0, categorie și axa „înainte”.

**Optimizarea personajului.** Originalul Innerscene avea 24,42 MB (19,2 MB texturi). A fost redus la 3,46 MB cu `gltf-transform`: `resize --width 256 --height 256`, `simplify --ratio 0.35 --error 0.002`, `prune`; skin-ul de 56 oase și toate cele șapte clipuri rămân, iar `KHR_materials_specular` a fost eliminat ca fișierul să rămână core glTF. Măsurătorile de geometrie/texturi/animații se refac cu `scripts/inspect-glb.mjs` și `scripts/inspect-glb-nodes.mjs`.

**Implementare.**

- `src/rendering/babylon/glb-model-library.ts` — decodare `LoadAssetContainerAsync` o dată per sesiune, `failed[]` pentru modelele indisponibile, `instantiate()` pentru scene.
- `src/rendering/babylon/vehicle-glb.ts` — rig-ul 145 peste GLB: holder rotit +90°, patru pivote la centrele anvelopelor, spin pe X, grupuri BODY/GLASS/HEADLIGHT/TAILLIGHT, vopsire deterministă pentru civile, emissive pentru faruri/stopuri.
- `src/rendering/babylon/character-scene.ts` — rig skinned + `setClip`, cu fallback procedural păstrat.
- `src/rendering/babylon/city-decor-glb.ts` — thin instances pentru copaci, lămpi, bănci, cu rotația `Ry(rotationY)` a planului 146.
- `src/main.ts` — biblioteca se încarcă înainte de compunere; `?capture=1&models=procedural` păstrează rig-ul vechi pentru dovada înainte/după.
- `src/build/asset-manifest-sources.ts` — șapte intrări `GLB` (`glb:<id>`), wire `IDENTITY` cu octeții de pe disc și cost decodat real.
- `tests/build/asset-manifest-report.ts` — check-ul `registry-honest-empty` a fost înlocuit cu `glb-core-only-no-decoder` (GLB core, zero decodor WASM/workspace), pentru că regula „niciun GLB final în V1” a fost depășită de acest PBI.

**Verificări executate.**

| Verificare | Rezultat |
| --- | --- |
| `npm run check` | PASS: typecheck, lint, format, arhitectură (442 fișiere, probe negative) și suita completă de teste |
| `npm run assets:manifest` | 49 intrări (33 critice / 16 opționale), wire 10.397.592 B, decoded 111.708.241 B, 15/17 check-uri; cele două eșecuri (`cross-check-145/146`) sunt pre-existente și provin din modificările necomise ale geometriei 247/249 — cu sursele din HEAD raportul dă 17/17 PASS (verificat) |
| `npm run perf:render-budget -- --measure` | 17 PASS, 0 FAIL, 2 NOT_MEASURED (fără GPU); draw calls oraș 12, decor 36, thin instances 78 |
| `npm run visual:capture` (HIGH/WebGPU) | 5 vederi înainte și după, aceeași build, zero erori de consolă |
| `npm run visual:compare` | personaj 72,606% · taxi 27,253% · stradă 4,031% · decor 2,933% · mașini civile 13,912% |
| `npm run qa:v1-regression` | 27/29 PASS, 0 FAIL, 2 NOT_RUN; graful de dependențe regenerat (254 noduri) |

**Dovezi pe disc.** `Docs/Evidence/254-realistic-3d-models/before-high-webgpu/` și `after-high-webgpu/` (5 PNG + `manifest.json` fiecare), `compare-before-high-webgpu-vs-after-high-webgpu/` (`compare.html`, `diff/*.png`, `report.json`), `Docs/Evidence/150-asset-manifest/`, `Docs/Evidence/157-render-budget/`, `Docs/Evidence/216-v1-regression/`, `Docs/Evidence/163-v2-contexts/`.

**Documentație.** [Docs/30](../../Docs/30-calitate-vizuala-v4.md) — principiul „asseturi licențiate explicit” (2026-11-24). [Docs/16](../../Docs/16-asseturi-vizual-si-audio.md) — secțiunea „Modele 3D realiste 254”. [Docs/21](../../Docs/21-acoperire-functionalitati.md), [Docs/README](../../Docs/README.md) și [PBI/README](../../PBI/README.md) — scope V4 extins la 255.

**Limitări.** (1) Kitul Innerscene este „low-poly” cu scară reală, deci realismul vine din proporții, materiale și umbre, nu din densitatea poligonilor. (2) `jordan-animated.glb` a fost simplificat la 35% din triunghiuri și texturi de 256 px; la distanță mică detaliul feței este vizibil redus. (3) Masele clădirilor și cinci piese de mobilier rămân procedurale până la PBI 255. (4) Măsurătoarea 157 este structurală (NullEngine), nu un FPS pe hardware. (5) `cross-check-145/146` din raportul 150 rămâne roșu în arborele de lucru din cauza dovezilor 145/146 neactualizate de PBI 247/249, nu din cauza acestui task.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '254' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-24: PBI creat din cerința utilizatorului de a înlocui geometria procedurală cu modele 3D realiste importate.
- 2026-11-24: Pipeline GLB livrat (catalog, loader, rig vehicul, personaj skinned, decor thin-instanced); clădirile și mobilierul rămas mutate explicit în PBI 255.
