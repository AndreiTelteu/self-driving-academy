---
id: "240"
title: "Randare pe tot ecranul, la rezoluție HD și DPR real"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["239"]
performance_checks: ["frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 240 Randare pe tot ecranul, la rezoluție HD și DPR real

## Obiectiv

Jocul trebuie să ocupe toată fereastra și să randeze la rezoluția reală a ecranului. În audit, scena are 640×360 pixeli în mijlocul unei ferestre de 1600×900 și arată pixelată.

## Context și plan

`src/style.css` fixează `canvas { width: min(100%, 40rem); height: 20rem }`. `src/main.ts` transmite `canvas.clientWidth/clientHeight` ca viewport, iar `daylight.apply()` setează `engine.setSize(internalWidth, internalHeight)`, rezultat din `resolveQuality`. `QUALITY_PRESETS` are `maxDpr` 1/1,5/2. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 1.

## Dependențe

- PBI 239 trebuie să fie în Done (harnessul de capturi).

## Criterii de acceptare

- [ ] Canvasul de joc ocupă 100% din viewportul ferestrei (`100dvw × 100dvh`), fără scroll și fără margini; titlul, butoanele și panoul Diagnostic nu mai sunt în fluxul paginii deasupra sau dedesubtul jocului (sunt mutate peste canvas sau, temporar, ascunse până la 251).
- [ ] Rezoluția internă este `clientSize × min(devicePixelRatio, maxDpr) × resolutionScale`; pe HIGH, la 1920×1080 cu DPR 1, `backend().renderWidth/renderHeight` raportează 1920×1080.
- [ ] Redimensionarea ferestrei, ecranul complet (F11 sau API Fullscreen) și mutarea între monitoare cu DPR diferit actualizează rezoluția internă, raportul de aspect și proiecția camerei fără distorsiune și fără recrearea scenei.
- [ ] Adaptive quality (`createAdaptiveQuality`) poate scădea `resolutionScale` sub buget și îl readuce când frame time-ul permite; schimbarea apare în panoul Diagnostic.
- [ ] HUD-ul, panourile și minimapul rămân lizibile și ancorate la 1280×720, 1920×1080 și 2560×1440.

## Verificare

Capturi 239 înainte/după la 1920×1080 pe HIGH și LOW. Teste unitare pentru calculul rezoluției interne (DPR, preset, scale, limite). Măsurare de frame pe preset, conform [contractului de performanță](../../Docs/25-performanta-contracte-si-benchmark.md); raportează separat costul de fill-rate adăugat.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '240' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: randare 640×360 într-o fereastră de 1600×900.
