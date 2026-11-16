---
id: "243"
title: "Cer, ceață atmosferică și iluminare din mediu (IBL)"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["241","242"]
performance_checks: ["frame","assets","loading"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-15T23:07:55.140Z"
completed_at: "2026-11-16T02:35:11+02:00"
---

# 243 Cer, ceață atmosferică și iluminare din mediu (IBL)

## Obiectiv

Înlocuiește cerul uniform și orizontul tăiat cu o atmosferă credibilă: cer cu gradient și soare, ceață de distanță și iluminare din mediu care să dea reflexii și lumină ambientală corectă materialelor PBR din 245–249.

## Context și plan

`daylight.ts` setează `scene.clearColor = (0.55, 0.74, 0.88)` și o lumină hemisferică fixă. Nu există skybox, ceață sau textură de mediu. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 7.

## Dependențe

- PBI 241 (pipeline HDR) și 242 (teren până la orizont) trebuie să fie în Done.

## Criterii de acceptare

- [x] Cerul este randat de un shader procedural sau de un skybox HDR original: gradient zenit–orizont, disc solar aliniat cu direcția luminii `daylight-sun` și nori opționali pe HIGH.
- [x] Ceața exponențială (sau perspectiva atmosferică în shader) are culoarea orizontului cerului; obiectele de la distanță se topesc în cer, fără margine dură, iar lizibilitatea la sub 80 m rămâne neschimbată.
- [x] Scena are `environmentTexture` (IBL prefiltrat, generat din cerul procedural sau un `.env` original), folosit pentru lumina ambientală și reflexiile speculare; lumina hemisferică este eliminată sau redusă, ca să nu dubleze ambientul.
- [x] Textura de mediu respectă bugetele 223 per preset (rezoluție mai mică pe LOW) și este inventariată în manifestul de asseturi 150 cu sursa și licența.
- [x] Cerul, ceața și IBL-ul primesc parametri dintr-o singură sursă (o „stare de atmosferă”), pregătind ora din zi din 252.

## Verificare

Capturi 239 (orizont, oraș de sus, stradă) înainte/după. `npm run assets:manifest -- --check` actualizat. Măsurare de încărcare și frame per preset.

## Dovezi de finalizare

**Rezultat.** Atmosferă procedurală cu o singură „stare de atmosferă” (`src/rendering/atmosphere.ts`): cer GLSL (gradient, aureolă Mie, disc solar aliniat cu `daylight-sun`, nori pe HIGH), ceață EXP2 în culoarea orizontului, IBL half-float generat din același cer (32/64/128 px pe LOW/MEDIUM/HIGH) cu polinom sferic, hemisferic redus 0,55 → 0,50 (soare 0,95 → 1,04, aproape alb) cu `setLegacyAmbientScale` pentru 245–249, culoarea de ștergere mutată din `post-processing.ts` în atmosferă, materiale înghețate reîmprospătate (`material-refresh.ts`). Detalii și numere: `Docs/30-calitate-vizuala-v4.md`, secțiunea 243.

**Fișiere.** Noi: `src/rendering/atmosphere.ts`, `src/rendering/babylon/{atmosphere-scene,atmosphere-sky-shader,material-refresh}.ts`, `tests/rendering/atmosphere.test.ts`. Modificate: `daylight.ts`, `post-processing.ts`, `quality-policy.ts` (`ATMOSPHERE_PRESETS`), `world-edge.ts` (haze 0,85 → 0,3), `visual-capture.ts` x2 (vederea `sky-sun`, `info().atmosphere`), `rendering/index.ts`, `build/asset-manifest-sources.ts`, `tests/{build/asset-manifest,rendering/lighting}.test.ts` (29 intrări în manifest; 8 materiale în scenă, cu motiv), `Docs/30-calitate-vizuala-v4.md`, `Docs/Evidence/150-asset-manifest/*` (regenerat).

**Corecții după revizuire.** Luminozitatea solului restabilită (vezi mai sus); `noon[1] < -0.999` înlocuit cu verificarea că `sunDirectionFromAngles` reproduce direcția `daylight-sun` (azimut/elevație derivate, toleranță 1e-9) și convenția azimutului; fișierele `Docs/Evidence/201-v3-validation/gate-measure/{measurement.json,report.json,report.md}` rescrise accidental de `perf:gate --measure` au fost restaurate din HEAD (`git status` curat pe ele); `qa:v3-validation` neregenerat.

**Verificări.** `npm run typecheck`, `lint`, `format:check`, `check:architecture`: trec. `npm test`: 3498 tests, 3498 pass, 0 fail. `assets:manifest -- --check`, `qa:v1-regression -- --check`, `v2:contexts -- --check`, `perf:render-budget -- --check`: curente. `qa:v3-validation -- --check`: învechit (era deja învechit înainte de 243, vezi 242; neregenerat). Validate-Plan și Validate-Board: rulate fără erori.

**Browser (build de producție, Chromium, GPU real).** WebGPU `amd rdna-2` și WebGL2, preseturi HIGH/MEDIUM/LOW: cer, ceață, discul solar, IBL pe sfere PBR de probă. Capturi 239 înainte/după în `Docs/Evidence/243-sky-fog-ibl/`. HIGH WebGPU și HIGH WebGL2: bandă de cer identică (133,3/166,9/212,2); LOW cu ~10–15 trepte mai luminos (fără vignetă/grading, moștenit de la 241); MEDIUM fără nori.

**Performanță (WebGPU `amd rdna-2`, 1920x1080, fără vsync, 3 rulări intercalate).** Medie pe 5 vederi: HIGH 3,69 → 3,85 ms; LOW 1,66 → 1,92 ms. Costul nu este uniform: `street-eye-level` crește cu 0,8–0,9 ms pe HIGH (1,37 → 2,18 ms) și pe LOW (0,98 → 1,88 ms), cu intervale min–max care nu se suprapun (nu este zgomot); `intersection-crosswalk` +0,7/+0,55 ms, `map-edge` +0,5 ms; `horizon` scade, `city-aerial` neschimbat. Încărcare IBL (o singură dată): HIGH 103 ms (WebGPU) / 71 ms (WebGL2), MEDIUM 36 ms, LOW 17/13 ms. Memorie GPU IBL: 64 KiB / 256 KiB / 1 MiB.

**Limitări.** Niciuna blocantă: norii numai pe HIGH; IBL din lanț de mip-uri, nu prefiltrat GGX; hemisfericul rămâne pentru `StandardMaterial` până la 245–249 (solul este la luminozitatea de la 241: −0,6% … 0,0% pe asfalt/trotuar/iarbă, clădirile −3% la lumină și −7% la umbră, măsurat în `ground-brightness-*.txt`; prima variantă era cu 7–18% mai întunecată și a fost corectată după revizuire); `qa:v3-validation` învechit anterior.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '243' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: cer de o singură culoare, orizont tăiat, fără adâncime atmosferică.
- 2026-11-16T02:35:11+02:00: implementat de subagentul Sonnet, aprobat de review-ul independent Sonnet (review-round1.md, APPROVED cu note); la cererea orchestratorului luminozitatea solului a fost readusă la nivelul 241 și costul a fost raportat onest; orchestratorul a eliminat PNG-urile duplicate, a regenerat raportul 201 și a mutat în Done.
