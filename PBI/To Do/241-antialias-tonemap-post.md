---
id: "241"
title: "Antialiasing, tone mapping unitar și post-procesare"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["240"]
performance_checks: ["frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 241 Antialiasing, tone mapping unitar și post-procesare

## Obiectiv

Elimină marginile zimțate și culorile arse sau plate. Toată scena trebuie să treacă prin același pipeline de culoare HDR, cu tone mapping, expunere și grading coerente.

## Context și plan

`backend.ts` creează motorul cu `antialias: false` atât pe WebGPU, cât și pe WebGL2. `daylight.ts` creează un `ImageProcessingConfiguration` ACES propriu, dar îl atașează numai materialelor `daylight-*`. Materialele orașului (`city-scene.ts`), ale decorului, ale vehiculelor și ale personajului nu au tone mapping, așa că trotuarul (albedo 0,62 sub lumină hemisferică 0,75 plus soare 1,1) apare alb ars. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problemele 2–3.

## Dependențe

- PBI 240 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Un singur `scene.imageProcessingConfiguration` (ACES sau Khronos PBR Neutral, decizia este documentată) este folosit de toate materialele, fără configurații paralele; expunerea și contrastul sunt calibrate astfel încât nicio suprafață difuză sub soare să nu se satureze în alb pur în cadrele 239.
- [ ] Antialiasing per preset: HIGH folosește MSAA 4× pe ținta HDR (sau TAA, dacă este stabil pe ambele backenduri); MEDIUM folosește MSAA 2× sau FXAA; LOW folosește FXAA. Marginile clădirilor, stâlpilor și liniilor de marcaj nu prezintă zimți vizibili la 1080p pe HIGH.
- [ ] `DefaultRenderingPipeline` (sau un echivalent) adaugă, pe MEDIUM și HIGH: bloom subtil limitat la surse emisive puternice, sharpen ușor, vignetă discretă și un LUT/grading de culoare neutru-cald. Pe LOW sunt dezactivate.
- [ ] Ținta HDR folosește un format cu precizie (half float) unde este suportat; banding-ul cerului nu este vizibil (adaugă dithering dacă este necesar).
- [ ] WebGPU și WebGL2 dau aceeași imagine în limita a 2% diferență medie de luminanță pe cadrele 239.
- [ ] Setările de calitate din meniu (preset) schimbă pipeline-ul live, fără reîncărcare și fără scurgeri de resurse (numărul de texturi și render targets revine la valoarea inițială după comutare repetată).

## Verificare

Capturi 239 înainte/după pe toate preseturile și pe ambele backenduri. Test de leak: 20 de comutări de preset cu numărare de resurse. Măsurare de frame și memorie GPU per preset; raportează costul suplimentar al pipeline-ului.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '241' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: zimți, trotuar ars, culori plate, tone mapping parțial.
