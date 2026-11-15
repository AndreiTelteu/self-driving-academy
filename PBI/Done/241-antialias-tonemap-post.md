---
id: "241"
title: "Antialiasing, tone mapping unitar și post-procesare"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["240"]
performance_checks: ["frame","memory"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-15T20:28:02.181Z"
completed_at: "2026-11-15T23:23:18+02:00"
---

# 241 Antialiasing, tone mapping unitar și post-procesare

## Obiectiv

Elimină marginile zimțate și culorile arse sau plate. Toată scena trebuie să treacă prin același pipeline de culoare HDR, cu tone mapping, expunere și grading coerente.

## Context și plan

`backend.ts` creează motorul cu `antialias: false` atât pe WebGPU, cât și pe WebGL2. `daylight.ts` creează un `ImageProcessingConfiguration` ACES propriu, dar îl atașează numai materialelor `daylight-*`. Materialele orașului (`city-scene.ts`), ale decorului, ale vehiculelor și ale personajului nu au tone mapping, așa că trotuarul (albedo 0,62 sub lumină hemisferică 0,75 plus soare 1,1) apare alb ars. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problemele 2–3.

## Dependențe

- PBI 240 trebuie să fie în Done.

## Criterii de acceptare

- [x] Un singur `scene.imageProcessingConfiguration` (ACES sau Khronos PBR Neutral, decizia este documentată) este folosit de toate materialele, fără configurații paralele; expunerea și contrastul sunt calibrate astfel încât nicio suprafață difuză sub soare să nu se satureze în alb pur în cadrele 239.
- [x] Antialiasing per preset: HIGH folosește MSAA 4× pe ținta HDR (sau TAA, dacă este stabil pe ambele backenduri); MEDIUM folosește MSAA 2× sau FXAA; LOW folosește FXAA. Marginile clădirilor, stâlpilor și liniilor de marcaj nu prezintă zimți vizibili la 1080p pe HIGH.
- [x] `DefaultRenderingPipeline` (sau un echivalent) adaugă, pe MEDIUM și HIGH: bloom subtil limitat la surse emisive puternice, sharpen ușor, vignetă discretă și un LUT/grading de culoare neutru-cald. Pe LOW sunt dezactivate.
- [x] Ținta HDR folosește un format cu precizie (half float) unde este suportat; banding-ul cerului nu este vizibil (adaugă dithering dacă este necesar).
- [x] WebGPU și WebGL2 dau aceeași imagine în limita a 2% diferență medie de luminanță pe cadrele 239.
- [x] Schimbarea presetului de calitate prin API-ul de preferințe (`daylight.applyPreferences`, pe care îl va folosi meniul de setări) schimbă pipeline-ul live, fără reîncărcare și fără scurgeri de resurse (numărul de texturi și render targets revine la valoarea inițială după comutare repetată).

## Verificare

Capturi 239 înainte/după pe toate preseturile și pe ambele backenduri. Test de leak: 20 de comutări de preset cu numărare de resurse. Măsurare de frame și memorie GPU per preset; raportează costul suplimentar al pipeline-ului.

## Dovezi de finalizare

**Implementare.** `src/rendering/babylon/post-processing.ts` (nou) calibrează unicul `scene.imageProcessingConfiguration` (Khronos PBR Neutral, expunere 1,45, contrast 1, vignetă, grading cald, dithering) și construiește pe preset trecerile: HIGH = `DefaultRenderingPipeline` HDR half-float cu MSAA 4× + bloom/sharpen/vignetă/grading; MEDIUM = același pipeline cu FXAA; LOW = fără pipeline, tone mapping în materiale + un FXAA. `daylight.ts` nu mai are configurație proprie; lumini 0,75/1,1 → 0,55/0,95. `quality-policy.ts`: `POST_PROCESSING_PRESETS`. `v3-composition-scene.ts` atașează camera. `visual-capture.ts`: info include starea.

**Runda 2 (review CHANGES_REQUIRED).**
1. **LOW întunecat după comutare live, cauza găsită.** Materialele orașului sunt înghețate (`freeze`) și nu se recompilau când pipeline-ul dispărea: shaderul rămânea compilat cu `IMAGEPROCESSINGPOSTPROCESS` (conversie în liniar fără întoarcerea în gamma), deci asfalt (3,4,6), iarbă (22,31,15). LOW pornit direct arăta corect, de aceea capturile 239 nu au prins-o. Fix: la fiecare schimbare de treceri, materialele înghețate se dezgheață, se marchează murdare și se îngheață din nou după 3 cadre randate. Test de regresie nou. Măsurat live (WebGPU și WebGL2, 1920×1080, street-eye-level): HIGH/MEDIUM/LOW după comutare au drum (46,52,64)/(46,52,64)/(56,62,73), iar media de luminanță 143,7/143,6/144,8; LOW după 20 de comutări identic cu LOW de la prima comutare.
2. **Asfalt.** Albedo asfalt 0,1→0,19 (oraș), 0,09→0,17 (drum daylight), intersecție 0,13→0,22: PBR Neutral scade negrul, deci albedo-ul mic dădea negru. Acum drumul este gri-ardezie (46,52,64) pe MEDIUM/HIGH, aproape de baseline-ul 239 (42,46,56), cu detaliu vizibil. **Halo marcaje:** prag bloom 1,25→2,5 (la 1,6 încă lumina asfaltul; la 2,2 dispare, testat live): numai surse HDR foarte puternice (faruri la 252) vor face bloom.
3. **Debug global.** `setPreset` și `scene` există doar cu `import.meta.env.DEV`, `?capture` sau `?debug`; fără ele `Object.keys(__v3Composition)` = ready, read, backend, stats, postProcessing, reset, probeDoubleDelivery (verificat pe build de producție, fără parametri). `setPreset` actualizează `sessionQuality` (folosit de logica adaptivă și de diagnostic), deci rămâne consistent.
4. `dispose()` restaurează toată configurația modificată (vignetteWeight/Stretch/Color/BlendMode, colorCurves, ditheringIntensity, plus cele de dinainte); test nou.
5. Dovezi reduse la 4 MB (6 PNG).

**Criteriul de comutare (reformulat de orchestrator, verificat):** `daylight.applyPreferences` schimbă presetul live. 20 de comutări LOW/MEDIUM/HIGH în Chromium pe GPU real, WebGPU și WebGL2: numărul de texturi, texturi interne, post-procese, pipeline-uri, treceri pe cameră și materiale înghețate revine la valoarea de bază pe preset (câmpuri textures/internalTextures/postProcesses/pipelines/cameraPasses/frozen: HIGH 1/9/0/1/6/12 WebGPU și 1/8/0/1/6/12 WebGL2; MEDIUM 1/10/0/1/7/12 și 1/9/0/1/7/12; LOW 0/2/1/0/1/12 și 0/1/1/0/1/12); plus testul unitar cu 20 de comutări.

**Verificări (rezultate reale, runda 2).** typecheck, lint, format:check, check:architecture: OK. `npm test`: tests 3460, pass 3460, fail 0 (5 teste noi în `tests/rendering/post-processing.test.ts`). qa:v1-regression --check și v2:contexts --check: curente. Validate-Plan.ps1 și Validate-Board.ps1: trecute.
- **Browser** (Chromium, AMD rdna-2, build de producție, 1920×1080): stare `postProcessing()`: LOW `MATERIAL_FXAA`, `applyByPostProcess=false`; MEDIUM/HIGH `PIPELINE`, `applyByPostProcess=true`, HALF_FLOAT, HIGH `msaaSamples=4`. Consolă: 0 erori.
- **Luminanță, 12 cadre 239 fără ui-hud (`luminance.txt`, `measure.mjs`):** WebGPU↔WebGL2 medie 0,015% HIGH / 0,019% MEDIUM / 0,021% LOW (maxim 0,174%; prag 2%). **LOW vs HIGH:** medie 1,31% (WebGPU) și 1,32% (WebGL2), maxim 1,97% (city-aerial; LOW nu are vignetă, deci e mai luminos). MEDIUM vs HIGH: medie 0,10%, maxim 0,54%. Pixeli albi puri: 0,96% înainte → 0,05% HIGH, 0,01% MEDIUM, 0,00% LOW.
- **Cost (rularea din runda 1, `perf-*.json`; nerefăcută, deoarece runda 2 nu schimbă numărul de treceri, ci pragul de bloom, albedo-uri și recompilarea la comutare):** WebGPU HIGH 1,46/1,69 → 3,61/3,68 ms (+2,1/+2,0), MEDIUM 1,45/1,45 → 3,38/3,62, LOW 1,22/1,33 → 1,78/2,05 (+0,56/+0,73); WebGL2 HIGH 1,00/1,14 → 1,73/2,95. Interval cadru fără vsync (street-eye-level / city-aerial), nu timp GPU (timer indisponibil). Memoria GPU nu s-a măsurat (nu există contor).

**Dovezi vizuale.** `Docs/Evidence/241-post-processing/`: before HIGH WebGPU (street-eye-level, city-aerial), after HIGH WebGPU (street-eye-level), after MEDIUM WebGPU (intersection-crosswalk: asfalt ardezie, fără halo), after LOW WebGPU și WebGL2, manifestele celor 6 combinații preset×backend, `luminance.txt`, `measure.mjs`, `perf-*.json`, `review-round1.md`.

**Limitări.** Asfaltul mai luminos vine din albedo (cerut de review); 245 îl înlocuiește cu materiale PBR. Fețele clădirilor în umbră rămân întunecate până la 243/244. Bloom este practic inactiv până apar surse HDR (252). PNG-urile HIGH/MEDIUM au ~1,6 MB (dithering = zgomot). Meniul de setări nu este montat (mutat la 251); comutarea e verificată prin `applyPreferences`. Cerul rămâne culoare uniformă (243). Fără MSAA 2× (WebGPU acceptă 1 sau 4).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '241' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: zimți, trotuar ars, culori plate, tone mapping parțial.
- 2026-11-15: orchestratorul a reformulat criteriul de comutare live: panoul de setări (`createGameSettingsPanel`) nu este montat în compunerea V3. Montarea lui și legarea presetului la `applyPreferences` au fost mutate explicit în 251 (constatare din review-round1).
- 2026-11-15T23:23:18+02:00: implementat de subagentul Sonnet în două runde (review-round1 CHANGES_REQUIRED: LOW întunecat din materiale înghețate, asfalt negru, debug neprotejat; review-round2 APPROVED), verificat de orchestrator și mutat în Done.
