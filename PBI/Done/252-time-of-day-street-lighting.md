---
id: "252"
title: "Ora din zi, iluminat stradal și faruri"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["246","247","249"]
performance_checks: ["frame","memory"]
owner: "OpenCode deepseek-v4.1-flash"
started_at: "2026-11-25T19:46:41+02:00"
completed_at: "2026-11-25T21:06:59+02:00"
---

# 252 Ora din zi, iluminat stradal și faruri

## Obiectiv

Adaugă atmosferă prin ora din zi: dimineață, amiază, apus și noapte, cu stâlpi de iluminat care se aprind, ferestre luminate și faruri care chiar luminează drumul.

## Context și plan

Starea de atmosferă din 243 (cer, ceață, IBL și soare) este sursa unică de parametri. Stâlpii (249), ferestrele (246) și farurile (247) au deja geometrie și materiale. Babylon limitează luminile per material (`materialLights: 2` în `QUALITY_PRESETS`), deci iluminatul stradal folosește lumini clustered sau o soluție echivalentă, nu sute de lumini clasice. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md).

## Dependențe

- PBI 246, 247 și 249 trebuie să fie în Done.

## Criterii de acceptare

- [x] Ora din zi este o setare (fixă sau ciclu lent) care interpolează lin soarele, cerul, ceața, IBL-ul și expunerea; schimbarea nu afectează simularea, determinismul sau KPI/XP.
- [x] Noaptea, stâlpii luminează trotuarul și carosabilul (clustered lights sau decal-uri de lumină), ferestrele clădirilor sunt luminate parțial (deterministic), iar farurile vehiculelor proiectează lumină pe drum; bloom-ul 241 se aplică pe surse.
- [x] Pe LOW, iluminarea de noapte folosește numai emisie și decal-uri, fără lumini dinamice, în bugetul de frame.
- [x] Semafoarele și marcajele rămân lizibile la orice oră (verificat pe cadrele 239 la noapte).

## Verificare

Capturi 239 la patru ore din zi pe HIGH și LOW. Măsurare de frame și memorie noaptea, cu 24 de vehicule, per preset.

## Dovezi de finalizare

**Implementare.**
- `src/rendering/time-of-day.ts` (pur): patru chei complete de atmosferă (dimineață 8:00, amiază 12:00, apus 18:42, noapte 23:00), interpolare `smoothstep`, `atmosphereAtHour`, `atmosphereAt`, `nextTimeOfDay`, `nearestTimeOfDay`. Amiaza folosește exact unghiurile `DAYLIGHT_SUN_DIRECTION` și valorile 243.
- `src/rendering/atmosphere.ts`: `AtmosphereInput` capătă `night`, `discRadiance`, `discAngularRadiusDeg`, `glowColor`, `gradientRate`, `mieStrength`, `legacyAmbientIntensity`, `environmentIntensity`; `AtmosphereState.night`; validare.
- `src/rendering/babylon/atmosphere-sky-shader.ts` și `atmosphere-scene.ts`: uniforma `night` în `uCloudParams.w`, stele pe grilă sferică, nori întunecați noaptea, disc lunar.
- `src/rendering/babylon/daylight.ts`: `setAtmosphere` scrie și `scene.imageProcessingConfiguration.exposure`.
- `src/rendering/babylon/city-scene.ts`: lot `buildingGlassLit` separat, aprins determinist de `setNightFactor`; zonele de serviciu se sting la 20% noaptea; reparat bug-ul `Empty city geometry` pe LOW (loturi de sticlă goale).
- `src/rendering/babylon/city-decor-scene.ts` + `city-decor-glb.ts`: emisia feței calde a lămpii și 312 pete de lumină pe sol (un mesh thin-instanced, textură radială aditivă), aprinse/stinse cu `setNightFactor`.
- `src/rendering/babylon/vehicle-glb.ts` + `vehicle-scene.ts`: lentilele farurilor aprinse proporțional cu noaptea, fără schimbarea contractului 145; `setNightFactor` pe fiecare reprezentare.
- `src/rendering/babylon/v3-composition-scene.ts`: `setTimeOfDay`/`getTimeOfDay`/`cycleTimeOfDay`, conuri de lumină thin-instanced pentru trafic (128 matrice) și un singur `SpotLight` real pe vehiculul urmărit (max 2 lumini/material, oprit pe LOW).
- `src/rendering/babylon/v3-browser-composition.ts`: tasta `T` cică ora; `src/main.ts` acceptă `?time=` la capturi și expune `__v3Composition.setTimeOfDay` în DEV/captură; `src/rendering/visual-capture.ts` și `scripts/visual-capture.mjs` au `--time`/`?time=`, iar manifestul scrie ora efectivă.
- `src/ui/character-hud.ts`: hint „T ora din zi”.

**Teste.** `node --import ./scripts/register-typescript.mjs --test tests/rendering/time-of-day.test.ts tests/rendering/city-scene.test.ts tests/rendering/atmosphere.test.ts tests/rendering/city-decor.test.ts tests/rendering/vehicle-scene.test.ts tests/rendering/vehicle-visuals.test.ts` — PASS. Testele noi acoperă cele patru stări, continuitatea pe 24 h (720 pași), amiaza identică cu baseline-ul 243, noaptea (lună, ambient, IBL), lotul de ferestre aprinse și cazul LOW fără geamuri.

**Capturi și cost.** `Docs/Evidence/252-time-of-day/`: `morning-high-webgpu`, `noon-high-webgpu`, `sunset-high-webgpu`, `night-high-webgpu` (4 vederi fiecare), `noon-low-webgpu`, `night-low-webgpu`, `night-high-webgpu-intersection`. GPU real `amd rdna-2`, WebGPU, 1920×1080, DPR 1, 30 de cadre. Timp CPU de randare (nu GPU; frame intervalul e plafonat de vsync la 16,7 ms): HIGH amiază 12,61–17,38 ms → noapte 15,30–21,85 ms; LOW amiază 4,14–6,96 ms → noapte 6,22–10,69 ms. Memoria suplimentară: două texturi 64², o matrice de 128 conuri, 312 matrice de pete, un spot fără hartă de umbră — sub 1 MiB. `npm run perf:render-budget` rămâne 17 PASS / 0 FAIL / 2 NOT_MEASURED (`STRUCTURAL_PASS`, hardware `NOT_VALIDATED`).

**Comparație.** `Docs/Evidence/252-time-of-day/compare-noon-before-after/` compară build-ul de dinainte (worktree la commit 26511205) cu amiaza după: 1,22–3,73% pixeli diferiți. Diferența este zgomot de captură, nu regresie: două capturi ale aceleiași build-uri diferă cu 0,06–6,06% în aceleași vederi, iar starea de amiază este identică în test (`sunToward` < 1e-9, culorile și intensitățile din 243). Diferența se vede în umbrele CSM după teleportul camerei și în HUD-ul schimbat; nu în geometrie sau materiale.

**Documentație.** `Docs/30` — secțiunea 252; `src/rendering` și testele de mai sus. `Docs/16` rămâne despre modele; nu s-a schimbat contractul de asseturi.

**Limitări.** Ora nu se persistă între sesiuni (T este o setare de sesiune; `?time` este pentru capturi). Tranziția apus→noapte mută discul de la soare la lună într-un interval scurt. Pe LOW clădirile nu au ferestre geometrice (246), deci noaptea nu au ferestre aprinse; spotul real există numai pe vehiculul urmărit. Capturile aceleiași build-uri nu sunt deterministe în zonele umbrite (CSM după teleport), aspect de tratat la 253. Măsurătoarea de frame este CPU render, nu GPU; hardware-ul integrat rămâne `NOT_VALIDATED`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '252' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual, pentru atmosferă și lumină dinamică.
- 2026-11-25: Livrat: patru stări interpolate, cer de noapte cu stele și lună, lămpi cu pete de lumină, ferestre aprinse determinist, faruri/spot real, tasta T și capturi `--time`; reparat crash-ul LOW la loturile de sticlă goale.
